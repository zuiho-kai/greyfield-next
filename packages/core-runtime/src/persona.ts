export interface CharacterPersona {
  name: string;
  userAddress?: string;
  background?: string;
  personality?: string;
  speakingStyle?: string;
  greeting?: string;
  tone: string;
  boundaries: string[];
  expressionMap: Record<string, string>;
}
