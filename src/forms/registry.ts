import type { FormConfig } from './types';
import { examFormConfig } from './examForm.config';

export const formRegistry: FormConfig[] = [examFormConfig];

export function getFormConfig(formType: string): FormConfig | undefined {
  return formRegistry.find((config) => config.formType === formType);
}
