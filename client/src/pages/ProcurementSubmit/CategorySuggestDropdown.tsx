import React from 'react';
import { Package } from 'lucide-react';
import { matchCategories } from './materialCategories';

interface CategorySuggestDropdownProps {
  keyword: string;
  onSelect: (category: string) => void;
  onClose: () => void;
}

const CategorySuggestDropdown: React.FC<CategorySuggestDropdownProps> = ({
  keyword,
  onSelect,
  onClose,
}) => {
  const matches = matchCategories(keyword);

  if (matches.length === 0) return null;

  return (
    <div className="absolute z-50 left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
      {matches.map((cat) => (
        <button
          key={cat}
          type="button"
          className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2 border-b border-border last:border-b-0"
          onClick={() => {
            onSelect(cat);
            onClose();
          }}
        >
          <Package className="size-3.5 text-muted-foreground shrink-0" />
          <span className="font-medium text-foreground">{cat}</span>
        </button>
      ))}
    </div>
  );
};

export default CategorySuggestDropdown;
