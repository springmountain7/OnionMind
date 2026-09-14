export function mergeSelectedFiles(current: File[], incoming: File[], limit: number) {
  const files = [...current];
  for (const file of incoming) {
    const duplicate = files.some(
      (existing) =>
        existing.name === file.name &&
        existing.size === file.size &&
        existing.lastModified === file.lastModified
    );
    if (!duplicate) files.push(file);
    if (files.length >= limit) break;
  }
  return files.slice(0, limit);
}

export function availableImageSlots(existingImageIds: string[], removedImageIds: string[]) {
  const removed = new Set(removedImageIds);
  return Math.max(0, 3 - existingImageIds.filter((id) => !removed.has(id)).length);
}
