// In a new utils/formatter.ts file
export function formatContentWithInteractions(content: any[], userId?: string) {
  return content.map(item => ({
    ...item,
    isLiked: userId ? item.likes?.some((l: any) => l.userId === userId) : false,
    isBookmarked: userId ? item.bookmarks?.some((b: any) => b.userId === userId) : false,
    likesCount: item._count.likes,
    commentsCount: item._count.comments,
    bookmarksCount: item._count.bookmarks,
    likes: undefined, // Clean up response
    bookmarks: undefined,
  }));
}