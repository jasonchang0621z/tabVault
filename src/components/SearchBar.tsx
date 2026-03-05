import { Search, X } from 'lucide-react';

interface Props {
  query: string;
  onChange: (value: string) => void;
}

export function SearchBar({ query, onChange }: Props) {
  return (
    <div className="relative px-3 py-2 border-b border-gray-100">
      <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
      <input
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search workspaces..."
        className="w-full pl-7 pr-7 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent"
      />
      {query && (
        <button
          onClick={() => onChange('')}
          className="absolute right-5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-200 rounded"
        >
          <X className="w-3 h-3 text-gray-400" />
        </button>
      )}
    </div>
  );
}
