function App() {
  return (
    <div className="w-[380px] h-[520px] bg-zinc-900 text-white flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-sm font-semibold tracking-tight">agentbar</span>
        <span className="text-xs text-zinc-500">AI Tools</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-zinc-400 text-sm">Detecting installed LLMs...</p>
      </div>
    </div>
  );
}

export default App;
