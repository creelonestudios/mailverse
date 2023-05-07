type ConfigValue = string | number | boolean;
export default function getConfig<T extends ConfigValue>(key: string, defaultValue?: T): T;
export {};
