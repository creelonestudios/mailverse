export type EnhancedStatusSubject = {
    code: number;
    name: string;
};
export interface StatusCode {
    code: number;
    message?: string;
    ok: boolean;
}
export interface EnhancedStatusCode extends StatusCode {
    class: number;
    subject: number;
    detail: number;
}
type EnhancedCode = `${bigint}.${bigint}.${bigint}`;
type StatusOptions = {
    message?: string;
    enhancedCode?: EnhancedCode;
    args?: string[];
};
export default function status(code: number, options?: StatusOptions | EnhancedCode): string;
export {};
