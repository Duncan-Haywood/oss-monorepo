export default function () {}
export const used = 1, unusedSecond = 2;
export function renamed() {}
export async function* neverImported() {}
export class Lonely {}
const local = 3;
export { local, local as alsoLocal };
export const { pickedA, inner: pickedB, ...restC } = { pickedA: 1, inner: 2 };
