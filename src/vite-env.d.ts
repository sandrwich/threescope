/// <reference types="vite/client" />
/// <reference types="svelte" />

declare module '*.glsl?raw' {
  const value: string;
  export default value;
}
