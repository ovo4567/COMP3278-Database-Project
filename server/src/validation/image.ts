import { z } from 'zod';

const dataImagePattern = /^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/;

export const isSupportedImageValue = (value: string): boolean => {
  if (dataImagePattern.test(value)) return true;

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export const buildImageInputSchema = (maxLength: number, label: string) =>
  z
    .string()
    .max(maxLength)
    .refine(isSupportedImageValue, `${label} must be an http(s) URL or a data:image URL`);
