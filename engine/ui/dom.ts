/** Small DOM helpers. Kept tiny on purpose; the UI is hand-written, not a framework. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

export function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

export function maybe<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

/** <dialog> is in the minimum requirement, so this is a thin wrapper, not a polyfill. */
export function openDialog(dialog: HTMLDialogElement): void {
  if (!dialog.open) dialog.showModal();
}

export function closeDialog(dialog: HTMLDialogElement): void {
  if (dialog.open) dialog.close();
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.firstChild.remove();
}
