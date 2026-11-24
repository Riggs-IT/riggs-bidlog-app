// Scope native details toggling to one mounted project editor. No data changes.
export function setProjectSectionsOpen(root, open) {
  if (!root) return;
  for (const section of root.querySelectorAll('details[data-project-disclosure]')) {
    section.open = Boolean(open);
  }
}

export function allProjectSectionsOpen(root) {
  const sections = root ? Array.from(root.querySelectorAll('details[data-project-disclosure]')) : [];
  return sections.length > 0 && sections.every(section => section.open);
}
