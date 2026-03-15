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
      content: 'This chat is rate-limited to prevent abuse and ensure fair usage.',
      isUser: false,
      type: 'message'
    },
    {
      id: 2,
      content: 'Hi there, how can I help you?',
      isUser: false,
      type: 'message'
    }
  ]);
  
  
  const [currentMessage, setCurrentMessage] = useState("");
  const [checkpointId, setCheckpointId] = useState(null);

  const getSessionId = (): string => {
    let sessionId = localStorage.getItem("session_id");
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem("session_id", sessionId);
    }
    return sessionId;
  };

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

        // Get session ID
        const sessionId = getSessionId();

        // Create URL with checkpoint ID if it exists
        // Use local server (default port 8000) or environment variable if set
        const serverUrl =   process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8000";
  
        // Remote server uses path parameter: /chat_stream/{message}?session_id=...&checkpoint_id=...
        let url = `${serverUrl}/chat_stream/${encodeURIComponent(userInput)}?session_id=${encodeURIComponent(sessionId)}`;
        if (checkpointId) {
          url += `&checkpoint_id=${encodeURIComponent(checkpointId)}`;
        }

        // Connect to SSE endpoint using EventSource
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/53cd6225-d9d3-4719-aaf4-51e4e03e6b12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:96',message:'Creating EventSource',data:{url:url,sessionId:sessionId},timestamp:Date.now(),runId:'run1',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        const eventSource = new EventSource(url);
        let streamedContent = "";
        let searchData: SearchInfo | null = null;
        let hasReceivedContent = false;
        let hasReceivedError = false;

        eventSource.onmessage = (event) => {
          try {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/53cd6225-d9d3-4719-aaf4-51e4e03e6b12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:102',message:'onmessage received',data:{rawData:event.data,hasReceivedError:hasReceivedError,hasReceivedContent:hasReceivedContent,streamedContentLength:streamedContent.length},timestamp:Date.now(),runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            const data = JSON.parse(event.data);
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/53cd6225-d9d3-4719-aaf4-51e4e03e6b12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:105',message:'Parsed event data',data:{dataType:data.type,dataMessage:data.message||null},timestamp:Date.now(),runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
        
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

            else if (data.type === "error") {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/53cd6225-d9d3-4719-aaf4-51e4e03e6b12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:193',message:'Error message received via onmessage',data:{errorMessage:data.message,hasReceivedErrorBefore:hasReceivedError},timestamp:Date.now(),runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                hasReceivedError = true;
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/53cd6225-d9d3-4719-aaf4-51e4e03e6b12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:195',message:'Setting hasReceivedError to true',data:{hasReceivedError:true},timestamp:Date.now(),runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                console.log("Error message:", data.message);
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === aiResponseId
                      ? { ...msg, content: data.message, isLoading: false }
                      : msg
                  )
                );  
                eventSource.close();
                return;
            }
        
          } catch (error) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/53cd6225-d9d3-4719-aaf4-51e4e03e6b12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:207',message:'Error parsing event data',data:{error:String(error),rawData:event.data},timestamp:Date.now(),runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            console.error("Error parsing event data:", error, event.data);
          }
        };
        
        // Handle errors
        eventSource.onerror = (error) => {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/53cd6225-d9d3-4719-aaf4-51e4e03e6b12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:212',message:'onerror called',data:{hasReceivedError:hasReceivedError,hasReceivedContent:hasReceivedContent,streamedContentLength:streamedContent.length},timestamp:Date.now(),runId:'run1',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
          console.error("EventSource error:", error);
          
          // Wait a bit to see if we receive an error message through onmessage
          // The server sends errors with status 200, so they should come through onmessage
          setTimeout(() => {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/53cd6225-d9d3-4719-aaf4-51e4e03e6b12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:217',message:'onerror setTimeout callback',data:{hasReceivedError:hasReceivedError,hasReceivedContent:hasReceivedContent,streamedContentLength:streamedContent.length,willShowGenericError:(!streamedContent && !hasReceivedContent && !hasReceivedError)},timestamp:Date.now(),runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
            // Only show generic error if we haven't received any content or error message
            if (!streamedContent && !hasReceivedContent && !hasReceivedError) {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/53cd6225-d9d3-4719-aaf4-51e4e03e6b12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:220',message:'Showing generic error message',data:{reason:'No content or error received'},timestamp:Date.now(),runId:'run1',hypothesisId:'E'})}).catch(()=>{});
              // #endregion
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === aiResponseId
                    ? { ...msg, content: "Sorry, there was an error processing your request.", isLoading: false }
                    : msg
                )
              );
            }
            eventSource.close();
          }, 100);
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