/// <reference types="vite/client" />

declare module "archiver";

declare module "keytar" {
  function setPassword(service: string, account: string, password: string): Promise<void>;
  function getPassword(service: string, account: string): Promise<string | null>;
  function deletePassword(service: string, account: string): Promise<boolean>;
  const keytar: { setPassword: typeof setPassword; getPassword: typeof getPassword; deletePassword: typeof deletePassword };
  export default keytar;
}
