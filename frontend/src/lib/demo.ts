/* Demo datasets for the hero + report preview.
   These are real, auditable URLs — the marketing visualization around
   them is cosmetic, but any audit started from them is a real run. */

export interface DemoDataset {
  label: string
  url: string
  source: 'Kaggle' | 'Hugging Face'
  /** Short display name used inside the provenance visualization. */
  short: string
}

export const DEMOS: DemoDataset[] = [
  { label: 'Iris', url: 'https://www.kaggle.com/datasets/uciml/iris', source: 'Kaggle', short: 'Iris Dataset' },
  { label: 'Titanic', url: 'https://www.kaggle.com/datasets/yasserh/titanic-dataset', source: 'Kaggle', short: 'Titanic Dataset' },
  { label: 'IMDb', url: 'https://huggingface.co/datasets/imdb', source: 'Hugging Face', short: 'IMDb Dataset' },
]

export const DEFAULT_DEMO = DEMOS[0]