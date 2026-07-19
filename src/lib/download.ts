// Client-side file download: no server route exists to hit (static SPA), so
// the blob is built in the tab and handed to an anchor click. Revoking on the
// next frame rather than synchronously gives Safari time to start the save.
export function downloadTextFile(filename: string, mimeType: string, contents: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
