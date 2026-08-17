export interface TranslationProvider {
  translate(text: string, sourceLanguage: string, targetLanguage: string): Promise<string>;
}
