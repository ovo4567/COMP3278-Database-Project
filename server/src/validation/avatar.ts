import { buildImageInputSchema } from './image.js';

const MAX_AVATAR_LENGTH = 800_000;

export const avatarInputSchema = buildImageInputSchema(MAX_AVATAR_LENGTH, 'Avatar');
