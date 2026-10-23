declare module 'edmonds-blossom-fixed' {
  // edges: [u, v, weight]; returns mate[v] = matched vertex or -1 (array may be shorter than vertex count).
  export default function blossom(edges: [number, number, number][], maxCardinality?: boolean): number[];
}
