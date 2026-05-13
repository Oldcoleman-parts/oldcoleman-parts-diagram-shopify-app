import { useState } from "react";

export interface CategoryPickerItem {
  id: number;
  name: string;
  parentId: number | null;
}

interface TreeNode extends CategoryPickerItem {
  children: TreeNode[];
}

function buildTree(cats: CategoryPickerItem[]): TreeNode[] {
  const map = new Map<number, TreeNode>();
  for (const c of cats) map.set(c.id, { ...c, children: [] });
  const roots: TreeNode[] = [];
  for (const [, node] of map) {
    if (!node.parentId || !map.has(node.parentId)) roots.push(node);
    else map.get(node.parentId)!.children.push(node);
  }
  function sort(nodes: TreeNode[]) {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) sort(n.children);
  }
  sort(roots);
  return roots;
}

function getPath(id: number, cats: CategoryPickerItem[]): string {
  const map = new Map(cats.map((c) => [c.id, c]));
  const parts: string[] = [];
  let cur = map.get(id);
  while (cur) {
    parts.unshift(cur.name);
    cur = cur.parentId ? map.get(cur.parentId) : undefined;
  }
  return parts.join(" › ");
}

function getAncestorIds(id: number, cats: CategoryPickerItem[]): number[] {
  const map = new Map(cats.map((c) => [c.id, c]));
  const ancestors: number[] = [];
  let cur = map.get(id);
  while (cur?.parentId) {
    ancestors.push(cur.parentId);
    cur = map.get(cur.parentId);
  }
  return ancestors;
}

export function expandWithAncestors(ids: number[], cats: CategoryPickerItem[]): number[] {
  const all = new Set(ids);
  for (const id of ids) {
    for (const anc of getAncestorIds(id, cats)) all.add(anc);
  }
  return Array.from(all);
}

function hasDescendantSelected(node: TreeNode, selectedIds: number[]): boolean {
  return node.children.some(
    (c) => selectedIds.includes(c.id) || hasDescendantSelected(c, selectedIds),
  );
}

function FolderIcon({ depth }: { depth: number }) {
  const color = depth === 0 ? "#f59e0b" : depth === 1 ? "#94a3b8" : "#c4ccd5";
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}>
      <path d="M3 7a2 2 0 0 1 2-2h4.586a1 1 0 0 1 .707.293L11.707 6.7A1 1 0 0 0 12.414 7H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

function CheckRow({ node, depth, selectedIds, onToggle }: {
  node: TreeNode;
  depth: number;
  selectedIds: number[];
  onToggle: (id: number) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isSelected = selectedIds.includes(node.id);
  // Auto-expand if any descendant is selected so user can see why parent is checked
  const [expanded, setExpanded] = useState(
    () => hasChildren && hasDescendantSelected(node, selectedIds),
  );
  const [hov, setHov] = useState(false);

  return (
    <>
      <div
        onClick={() => onToggle(node.id)}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: `4px 8px 4px ${8 + depth * 18}px`,
          borderRadius: "5px",
          cursor: "pointer",
          background: isSelected ? "#f0faf7" : hov ? "#f9fafb" : "transparent",
          userSelect: "none",
        }}
      >
        {/* Chevron spacer */}
        <div style={{ width: 14, height: 14, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {hasChildren && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setExpanded((x) => !x); }}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: 0, color: "#9ca3af", display: "flex", lineHeight: 1,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" clipRule="evenodd" d={expanded
                  ? "M5.293 7.293a1 1 0 0 1 1.414 0L10 10.586l3.293-3.293a1 1 0 1 1 1.414 1.414l-4 4a1 1 0 0 1-1.414 0l-4-4a1 1 0 0 1 0-1.414z"
                  : "M7.293 14.707a1 1 0 0 1 0-1.414L10.586 10 7.293 6.707a1 1 0 0 1 1.414-1.414l4 4a1 1 0 0 1 0 1.414l-4 4a1 1 0 0 1-1.414 0z"
                } />
              </svg>
            </button>
          )}
        </div>

        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle(node.id)}
          onClick={(e) => e.stopPropagation()}
          style={{ cursor: "pointer", width: 14, height: 14, accentColor: "#008060", flexShrink: 0 }}
        />

        <FolderIcon depth={depth} />

        <span style={{
          fontSize: "13px",
          color: isSelected ? "#006e52" : "#374151",
          fontWeight: isSelected ? 500 : 400,
          lineHeight: "1.4",
          flex: 1,
        }}>
          {node.name}
        </span>

        {hasChildren && !isSelected && (
          <span style={{ fontSize: "10px", color: "#c4ccd5", flexShrink: 0 }}>
            {node.children.length}
          </span>
        )}
      </div>

      {hasChildren && expanded && node.children.map((child) => (
        <CheckRow
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedIds={selectedIds}
          onToggle={onToggle}
        />
      ))}
    </>
  );
}

export function CategoryPicker({ allCategories, selectedIds, onChange }: {
  allCategories: CategoryPickerItem[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const tree = buildTree(allCategories);

  function toggle(id: number) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      // Also select all ancestors so parent categories appear checked
      const ancestors = getAncestorIds(id, allCategories);
      onChange([...new Set([...selectedIds, id, ...ancestors])]);
    }
  }

  const ancestorsOfSelected = new Set(
    selectedIds.flatMap((id) => getAncestorIds(id, allCategories))
  );
  const selectedItems = allCategories.filter(
    (c) => selectedIds.includes(c.id) && !ancestorsOfSelected.has(c.id)
  );

  return (
    <div>
      {/* Selected chips */}
      {selectedItems.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
          {selectedItems.map((cat) => (
            <span
              key={cat.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                background: "#edf9f4",
                border: "1px solid #a3d9be",
                borderRadius: "20px",
                padding: "3px 8px 3px 10px",
                fontSize: "12px",
                color: "#006e52",
                fontWeight: 500,
                maxWidth: "100%",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {getPath(cat.id, allCategories)}
              </span>
              <button
                type="button"
                onClick={() => toggle(cat.id)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  padding: 0, color: "#65a58f", fontSize: "16px", lineHeight: 1,
                  display: "flex", alignItems: "center", flexShrink: 0,
                }}
                aria-label={`Remove ${cat.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Tree */}
      {tree.length === 0 ? (
        <div style={{
          fontSize: "13px", color: "#9ca3af",
          padding: "16px", textAlign: "center",
          border: "1px solid #e5e7eb", borderRadius: "8px",
        }}>
          No categories yet.{" "}
          <a href="/app/categories" style={{ color: "#008060" }}>Create categories first →</a>
        </div>
      ) : (
        <div style={{
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          background: "#fff",
          padding: "6px",
          maxHeight: "280px",
          overflowY: "auto",
        }}>
          {tree.map((root) => (
            <CheckRow
              key={root.id}
              node={root}
              depth={0}
              selectedIds={selectedIds}
              onToggle={toggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
