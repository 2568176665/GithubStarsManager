import React from 'react';
import { Moon, Palette, Sun } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';

interface ThemeSettingsCardProps {
  t: (zh: string, en: string) => string;
}

export const ThemeSettingsCard: React.FC<ThemeSettingsCardProps> = ({ t }) => {
  const { theme, setTheme } = useAppStore(useShallow((state) => ({
    theme: state.theme,
    setTheme: state.setTheme,
  })));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center space-x-3">
          <Palette className="h-5 w-5 text-muted-foreground" />
          <CardTitle>{t('外观设置', 'Appearance')}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <p id="theme-mode-label" className="mb-3 text-sm font-medium text-foreground">
            {t('显示模式', 'Display Mode')}
          </p>
          <RadioGroup
            aria-labelledby="theme-mode-label"
            value={theme}
            onValueChange={(value) => setTheme(value as 'light' | 'dark')}
            className="grid max-w-md grid-cols-2 gap-4"
          >
            <Label
              htmlFor="theme-mode-light"
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-background dark:border-border dark:hover:bg-card/[0.10]"
            >
              <RadioGroupItem value="light" id="theme-mode-light" aria-labelledby="theme-mode-light-label" />
              <Sun className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span id="theme-mode-light-label" className="text-base font-medium text-foreground">
                {t('浅色', 'Light')}
              </span>
            </Label>
            <Label
              htmlFor="theme-mode-dark"
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-background dark:border-border dark:hover:bg-card/[0.10]"
            >
              <RadioGroupItem value="dark" id="theme-mode-dark" aria-labelledby="theme-mode-dark-label" />
              <Moon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span id="theme-mode-dark-label" className="text-base font-medium text-foreground">
                {t('深色', 'Dark')}
              </span>
            </Label>
          </RadioGroup>
        </div>
      </CardContent>
    </Card>
  );
};
