export const urlToDomain = (url: string) => {
  return new URL(url).hostname;
};
