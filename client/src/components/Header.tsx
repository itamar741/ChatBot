const Header = () => {
    return (
        <header className="relative flex items-center justify-between px-8 py-5 bg-gradient-to-r from-[#7ef0b7] to-[#fdf4ca] z-10">
            <div className="absolute inset-0 bg-[url('/api/placeholder/100/100')] opacity-5 mix-blend-overlay"></div>
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>

            <div className="flex items-center relative">
                <div className="absolute -left-3 top-1/2 transform -translate-y-1/2 w-1.5 h-6 bg-teal-400 rounded-full opacity-80"></div>
                <span className="font-bold text-white text-xl tracking-tight">ChatBot</span>
            </div>

            <div className="flex items-center space-x-1">
                <a className="text-gray-600/80 text-xs px-4 py-2 font-medium hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200 cursor-pointer">HOME</a>
                <a className="text-gray-600/80 bg-teal-400/10 text-xs px-4 py-2 font-medium hover:bg-white/15 rounded-lg transition-all duration-200 cursor-pointer">CHAT</a>
            </div>
        </header>
    )
}

export default Header