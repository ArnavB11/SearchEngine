// Wraps every occurrence of a search term in <mark>, the way Google bolds the
// matched words inside a result snippet.
//
// Note we never build HTML strings and inject them with dangerouslySetInnerHTML.
// Document text is untrusted input; returning an array of React elements lets
// React escape it, so a document containing "<script>" stays plain text.

// A user could type "c++" or "a.b", and those characters mean something special
// inside a regular expression. Escaping them makes the regex match them literally.
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function Highlight({ text, terms = [] }) {
  if (!text) return null;
  if (terms.length === 0) return text;

  // Longest terms first: matching "javascript" before "java" avoids leaving a
  // stray "script" behind as unhighlighted text.
  const pattern = new RegExp(
    `(${terms.map(escapeRegex).sort((a, b) => b.length - a.length).join('|')})`,
    'gi', // g = every match, i = case insensitive
  );

  // Splitting on a regex with a capture group keeps the matches in the result
  // array: ["plain ", "match", " plain"]. So even indexes are ordinary text and
  // odd indexes are the matched words - no second pass needed to tell them apart.
  const pieces = text.split(pattern);

  return pieces.map((piece, i) =>
    i % 2 === 1 ? <mark key={i}>{piece}</mark> : piece,
  );
}
