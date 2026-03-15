"use client"

import Header from '@/components/Header';
import InputBar from '@/components/InputBar';
import MessageArea from '@/components/MessageArea';
import React, { useState } from 'react';

interface SearchInfo {
  stages: string[];
  query: string;
  urls: string[];
}

interface Message {
  id: number;
  content: string;
  isUser: boolean;
  type: string;
  isLoading?: boolean;
  searchInfo?: SearchInfo;
}

const Home = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      content: 'Hi there, how can I help you?',
      isUser: false,
      type: 'message'
    }
  ]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [checkpointId, setCheckpointId] = useState(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (currentMessage.trim()) {
      // First add the user message to the chat
      const newMessageId = messages.length > 0 ? Math.max(...messages.map(msg => msg.id)) + 1 : 1;

      setMessages(prev => [
        ...prev,
        {
          id: newMessageId,
          content: currentMessage,
          isUser: true,
          type: 'message'
        }
      ]);

      const userInput = currentMessage;
      setCurrentMessage(""); // Clear input field immediately

      try {
        // Create AI response placeholder
        const aiResponseId = newMessageId + 1;
        setMessages(prev => [
          ...prev,
          {
            id: aiResponseId,
            content: "",
            isUser: false,
            type: 'message',
            isLoading: true,
            searchInfo: {
              stages: [],
              query: "",
              urls: []
            }
          }
        ]);

        // Create URL with checkpoint ID if it exists
        // Use local server (default port 8000) or environment variable if set
        const serverUrl = 'https://perplexity-latest-e697.onrender.com';
        // Remote server uses path parameter: /chat_stream/{message}?checkpoint_id=...
        let url = `${serverUrl}/chat_stream/${encodeURIComponent(userInput)}`;
        if (checkpointId) {
          url += `?checkpoint_id=${encodeURIComponent(checkpointId)}`;
        }

        // Connect to SSE endpoint using EventSource
        const eventSource = new EventSource(url);
        let streamedContent = "";
        let searchData: SearchInfo | null = null;
        let hasReceivedContent = false;

        eventSource.onmessage = (event) => {
          try {
            // TEMPORARY WORKAROUND:
            // The SSE stream occasionally returns double-encoded JSON (e.g. ""text"" or stringified arrays)
            // coming from the server / LangGraph event stream.
            //
            // To prevent JSON.parse failures we attempt to sanitize the payload before parsing.
            //
            // This logic should be removed once the server emits valid JSON consistently.
            // A future update will fix the serialization at the server level.
            // Fix double-encoded JSON: handle double-encoded strings in any field
            let rawData = event.data;
            let data;
            try {
              data = JSON.parse(rawData);
            } catch (parseError: unknown) {
              // If parsing fails, try to fix double-encoded strings
              // Pattern: "field":""value"" -> "field":"value"
              // Also handle: "field":"["array"]" -> "field":["array"]
              let fixedData = rawData;
              
              // Fix double-encoded strings: "field":""value"" -> "field":"value"
              fixedData = fixedData.replace(/"([^"]+)":"("+)(.*?)("+)"/g, (_match: string, fieldName: string, _leadingQuotes: string, value: string, _trailingQuotes: string) => {
                // Remove extra quotes from value
                const cleanedValue = value.replace(/^"+|"+$/g, '');
                // Escape any quotes in the value for JSON
                const escapedValue = cleanedValue.replace(/"/g, '\\"');
                return `"${fieldName}":"${escapedValue}"`;
              });
              
              // Fix double-encoded arrays: "field":"["array"]" -> "field":["array"]
              fixedData = fixedData.replace(/"([^"]+)":"(\[.*?\])"/g, (_match: string, fieldName: string, arrayStr: string) => {
                return `"${fieldName}":${arrayStr}`;
              });
              
              try {
                data = JSON.parse(fixedData);
              } catch (secondError: unknown) {
                // If still fails, throw original error
                throw parseError;
              }
            }
            
            // Post-process: fix any remaining double-encoded fields
            if (data.type === 'search_start' && typeof data.query === 'string' && data.query.startsWith('"') && data.query.endsWith('"')) {
              try {
                data.query = JSON.parse(data.query);
              } catch {
                // If parsing fails, just remove the outer quotes
                data.query = data.query.slice(1, -1);
              }
            }
            if (data.type === 'search_results' && typeof data.urls === 'string') {
              try {
                data.urls = JSON.parse(data.urls);
              } catch {
                // If parsing fails, try to extract URLs from string
                const urlMatch = data.urls.match(/\[(.*?)\]/);
                if (urlMatch) {
                  try {
                    data.urls = JSON.parse(`[${urlMatch[1]}]`);
                  } catch {
                    data.urls = [];
                  }
                } else {
                  data.urls = [];
                }
              }
            }
        
            if (data.type === 'checkpoint') {
              setCheckpointId(data.checkpoint_id);
            }
            else if (data.type === 'content') {
              streamedContent += data.content;
              hasReceivedContent = true;
        
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === aiResponseId
                    ? { ...msg, content: streamedContent, isLoading: false }
                    : msg
                )
              );
            }
            else if (data.type === 'search_start') {
              const newSearchInfo = {
                stages: ['searching'],
                query: data.query,
                urls: []
              };
        
              searchData = newSearchInfo;
        
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === aiResponseId
                    ? { ...msg, content: streamedContent, searchInfo: newSearchInfo, isLoading: false }
                    : msg
                )
              );
            }
            else if (data.type === 'search_results') {
              const urls = data.urls;
        
              const newSearchInfo = {
                stages: searchData ? [...searchData.stages, 'reading'] : ['reading'],
                query: searchData?.query || "",
                urls: urls
              };
        
              searchData = newSearchInfo;
        
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === aiResponseId
                    ? { ...msg, content: streamedContent, searchInfo: newSearchInfo, isLoading: false }
                    : msg
                )
              );
            }
            else if (data.type === 'search_error') {
              const newSearchInfo = {
                stages: searchData ? [...searchData.stages, 'error'] : ['error'],
                query: searchData?.query || "",
                error: data.error,
                urls: []
              };
        
              searchData = newSearchInfo;
        
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === aiResponseId
                    ? { ...msg, content: streamedContent, searchInfo: newSearchInfo, isLoading: false }
                    : msg
                )
              );
            }
            else if (data.type === 'end') {
              if (searchData) {
                const finalSearchInfo = {
                  ...searchData,
                  stages: [...searchData.stages, 'writing']
                };
        
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === aiResponseId
                      ? { ...msg, searchInfo: finalSearchInfo, isLoading: false }
                      : msg
                  )
                );
              }
        
              eventSource.close();
            }
        
          } catch (error) {
            console.error("Error parsing event data:", error, event.data);
          }
        };
        
        // Handle errors
        eventSource.onerror = (error) => {
          console.error("EventSource error:", error);
          eventSource.close();

          // Only update with error if we don't have content yet
          if (!streamedContent) {
            setMessages(prev =>
              prev.map(msg =>
                msg.id === aiResponseId
                  ? { ...msg, content: "Sorry, there was an error processing your request.", isLoading: false }
                  : msg
              )
            );
          }
        };

        // Listen for end event
        eventSource.addEventListener('end', () => {
          eventSource.close();
        });
      } catch (error) {
        console.error("Error setting up EventSource:", error);
        setMessages(prev => [
          ...prev,
          {
            id: newMessageId + 1,
            content: "Sorry, there was an error connecting to the server.",
            isUser: false,
            type: 'message',
            isLoading: false
          }
        ]);
      }
    }
  };

  return (
    <div className="flex justify-center bg-gray-100 min-h-screen py-8 px-4">
      {/* Main container with refined shadow and border */}
      <div className="w-[70%] bg-white flex flex-col rounded-xl shadow-lg border border-gray-100 overflow-hidden h-[90vh]">
        <Header />
        <MessageArea messages={messages} />
        <InputBar currentMessage={currentMessage} setCurrentMessage={setCurrentMessage} onSubmit={handleSubmit} />
      </div>
    </div>
  );
};

export default Home;