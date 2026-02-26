export const devLog = (...args: any[]) => {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
};

export const devWarn = (...args: any[]) => {
  if (import.meta.env.DEV) {
    console.warn(...args);
  }
};
