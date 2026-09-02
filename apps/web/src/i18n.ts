import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en/translation.json";
import vi from "./locales/vi/translation.json";

void i18n.use(initReactI18next).init({
  resources: {
    vi: { translation: vi },
    en: { translation: en },
  },
  lng: "vi",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export { i18n };
