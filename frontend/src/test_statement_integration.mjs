import { parseSections } from "./statement.js";

const raw = `Ví dụ :
Input 01
6
1 2 4 1 5 2
Output 01
4`;

const sections = parseSections(raw);
console.log(JSON.stringify(sections, null, 2));
