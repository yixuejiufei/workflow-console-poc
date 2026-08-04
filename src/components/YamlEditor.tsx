interface Props {
  value: string;
  onChange: (value: string) => void;
  onParse: () => void;
  error: string | null;
}

export default function YamlEditor({ value, onChange, onParse, error }: Props) {
  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <h2 className="font-semibold text-sm text-slate-700">Workflow YAML</h2>
        <button
          onClick={onParse}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded font-medium"
        >
          解析图
        </button>
      </div>
      <textarea
        className="flex-1 w-full p-4 font-mono text-xs text-slate-700 resize-none focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      {error && (
        <div className="px-4 py-2 bg-red-50 text-red-600 text-xs border-t border-red-100">
          {error}
        </div>
      )}
    </div>
  );
}
