const FENCE = /```(\w*)\n?([\s\S]*?)```/g;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlight(code: string): string {
  if (code.length > 8000) return esc(code); // skip huge blocks
  const keywords = /\b(import|export|from|const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|throw|new|class|extends|interface|type|enum|async|await|yield|default|static|public|private|protected|readonly|true|false|null|undefined|this|super|in|of|typeof|instanceof|void|delete)\b/g;
  const strings = /(["'`])(?:(?!\1)[^\\]|\\.)*\1/g;
  const comments = /\/\/[^\n]*|\/\*[\s\S]*?\*\//g;
  const numbers = /\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g;
  const props = /\b([\w]+)(?=\s*[:=])/g;
  
  let out = esc(code);
  out = out.replace(comments, '<span class="syn-c">$&</span>');
  out = out.replace(strings, '<span class="syn-s">$&</span>');
  out = out.replace(/&lt;span class="syn-[cs]"[^>]*&gt;(.*?)&lt;\/span&gt;/g, '<span class="syn-c">$1</span>'); // fix escaped spans inside strings
  out = out.replace(keywords, '<span class="syn-k">$&</span>');
  out = out.replace(numbers, '<span class="syn-n">$&</span>');
  return out;
}
function inline(s: string): string {
  s = s.replace(/`([^`]+)`/g, (_m, c) => "<code>" + c + "</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  return s;
}
export function md(src: string): string {
  if (!src) return "";
  const blocks: string[] = [];
  src = src.replace(FENCE, (_m, _lang, code) => {
    blocks.push("<pre><code>" + highlight(String(code).replace(/\n$/, "")) + "</code></pre>");
    return "@@CB" + (blocks.length - 1) + "@@";
  });
  src = esc(src);
  const lines = src.split(/\r?\n/);
  let out = ""; let para: string[] = []; let i = 0;
  const flush = () => { if (para.length) { out += "<p>" + inline(para.join("\n")).replace(/\n/g, "<br>") + "</p>"; para = []; } };
  while (i < lines.length) {
    const line = lines[i];
    if (/^@@CB\d+@@$/.test(line)) { flush(); out += line; i++; continue; }
    if (/^\s*$/.test(line)) { flush(); i++; continue; }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) { flush(); const l = m[1].length; out += `<h${l}>${inline(m[2])}</h${l}>`; i++; continue; }
    if (/^\s*([-*+])\s+/.test(line)) { flush(); out += "<ul>"; while (i < lines.length && /^\s*([-*+])\s+/.test(lines[i])) { out += "<li>" + inline(lines[i].replace(/^\s*([-*+])\s+/, "")) + "</li>"; i++; } out += "</ul>"; continue; }
    if (/^\s*\d+\.\s+/.test(line)) { flush(); out += "<ol>"; while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { out += "<li>" + inline(lines[i].replace(/^\s*\d+\.\s+/, "")) + "</li>"; i++; } out += "</ol>"; continue; }
    if (/^\s*>\s?/.test(line)) { flush(); const q: string[] = []; while (i < lines.length && /^\s*>\s?/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, "")); i++; } out += "<blockquote>" + inline(q.join(" ")) + "</blockquote>"; continue; }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { flush(); out += "<hr>"; i++; continue; }
    para.push(line); i++;
  }
  flush();
  return out.replace(/@@CB(\d+)@@/g, (_m, n) => blocks[+n]);
}
