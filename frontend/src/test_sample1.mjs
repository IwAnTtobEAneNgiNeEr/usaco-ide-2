import { parseSections } from "./statement.js";

const raw = `KẾT QUẢ RA
Xuất ra tổng giá trị lớn nhất của các đồ vật mà Taro có thể mang về.

Sample 1
Input:
6
1 2 4 1 5 2
Output:
4`;

const sections = parseSections(raw);
console.log(JSON.stringify(sections, null, 2));
