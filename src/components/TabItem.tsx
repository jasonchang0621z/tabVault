import type { SavedTab } from '../utils/types';

interface Props {
  tab: SavedTab;
}

export function TabItem({ tab }: Props) {
  const domain = (() => {
    try {
      return new URL(tab.url).hostname;
    } catch {
      return tab.url;
    }
  })();

  return (
    <div className="flex items-center gap-2 py-1 px-2 text-xs">
      {tab.favIconUrl ? (
        <img
          src={tab.favIconUrl}
          alt=""
          className="w-3.5 h-3.5 flex-shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div className="w-3.5 h-3.5 flex-shrink-0 rounded-sm bg-gray-200" />
      )}
      <span className="truncate text-gray-700" title={tab.title}>
        {tab.title || domain}
      </span>
      <span className="ml-auto text-gray-400 flex-shrink-0 text-[10px]">{domain}</span>
    </div>
  );
}
