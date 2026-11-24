"use client";

import { Fragment, useState } from "react";
import { ArrowLeft, ChevronRight, Search, type LucideIcon } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuSeparator } from "@ui-sdk/react/menu";
import "./board-context-menu.css";

export type BoardMenuItem = {
  id: string;
  label: string;
  keywords?: string;
  icon?: LucideIcon;
  shortcut?: string;
  disabled?: boolean;
  dividerBefore?: boolean;
  onSelect: () => void;
  opensSubmenu?: boolean;
};

export default function BoardContextMenu({ anchor, title, items, onClose, onBack, searchable = false }: {
  anchor: { x: number; y: number };
  title: string;
  items: readonly BoardMenuItem[];
  onClose: () => void;
  onBack?: () => void;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const filtered = items.filter((item) => `${item.label} ${item.keywords ?? ""}`.toLocaleLowerCase().includes(needle));

  return (
    <Menu open onOpenChange={(open) => { if (!open) onClose(); }}>
      <MenuContent anchor={anchor} side="bottom" align="start" sideOffset={0}
        collisionPadding={8} aria-label={title}
        className="board-context-menu" onKeyDown={(event) => event.stopPropagation()}>
        <div className="board-context-heading">
          {onBack && <button type="button" className="board-context-back" aria-label="이전 메뉴" onClick={onBack}>
            <ArrowLeft size={16} aria-hidden="true" />
          </button>}
          <strong>{title}</strong>
        </div>
        {searchable && <label className="board-context-search">
          <Search size={16} aria-hidden="true" />
          <input aria-label="메뉴 검색" value={query} onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key !== "Escape" && event.key !== "ArrowDown") event.stopPropagation(); }} />
        </label>}
        {filtered.map((item) => {
          const Icon = item.icon;
          return <Fragment key={item.id}>
            {item.dividerBefore && <MenuSeparator className="board-context-separator" />}
            <MenuItem value={item.id} disabled={item.disabled} closeOnSelect={false} onSelect={item.onSelect} className="board-context-item">
              {Icon && <Icon size={16} aria-hidden="true" />}
              <span>{item.label}</span>
              {item.shortcut && <kbd aria-hidden="true">{item.shortcut}</kbd>}
              {item.opensSubmenu && <ChevronRight size={15} aria-hidden="true" />}
            </MenuItem>
          </Fragment>;
        })}
        {!filtered.length && <p className="board-context-empty">검색 결과가 없습니다.</p>}
      </MenuContent>
    </Menu>
  );
}
