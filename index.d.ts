declare type JSON_any = { [key: string]: any };

declare module '*.txt' {
  const content: string;
  export default content;
}