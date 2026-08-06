import React from 'react';
import { FolderOpen, Loader2 } from 'lucide-react';
import type { ProjectInfoItem } from '@shared/api.interface';

interface ProjectSuggestDropdownProps {
  suggestions: ProjectInfoItem[];
  loading: boolean;
  onSelect: (project: ProjectInfoItem) => void;
  onClose: () => void;
}

const ProjectSuggestDropdown: React.FC<ProjectSuggestDropdownProps> = ({
  suggestions,
  loading,
  onSelect,
  onClose,
}) => {
  if (suggestions.length === 0 && !loading) return null;

  return (
    <div className="absolute z-50 left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
      {loading ? (
        <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          搜索中...
        </div>
      ) : (
        suggestions.map((item) => (
          <button
            key={item.projectCode}
            type="button"
            className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2 border-b border-border last:border-b-0"
            onClick={() => {
              onSelect(item);
              onClose();
            }}
          >
            <FolderOpen className="size-3.5 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-foreground truncate">{item.projectCode}</div>
              {item.projectName && (
                <div className="text-xs text-muted-foreground truncate">{item.projectName}</div>
              )}
            </div>
          </button>
        ))
      )}
    </div>
  );
};

export default ProjectSuggestDropdown;
