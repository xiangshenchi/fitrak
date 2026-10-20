// 教程回退链接：极少数未预置精确链接的动作，回退为限定 MuscleWiki 的站内检索
export function tutorialFallbackUrl(name) {
  return 'https://www.bing.com/search?q=' +
    encodeURIComponent(`site:musclewiki.com ${name}`);
}
