import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function round(value: number, places = 0) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
