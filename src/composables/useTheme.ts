import { ref, watchEffect } from 'vue'

export enum Theme {
  LIGHT = 'light',
  DARK = 'dark',
}

export function useTheme() {
  const theme = ref<Theme>(
    (localStorage.getItem('theme') as Theme) || Theme.LIGHT
  )

  watchEffect(() => {
    document.documentElement.setAttribute('data-theme', theme.value)
    localStorage.setItem('theme', theme.value)
  })

  function toggleTheme() {
    theme.value = theme.value === Theme.LIGHT ? Theme.DARK : Theme.LIGHT
  }

  return {
    theme,
    toggleTheme,
  }
} 