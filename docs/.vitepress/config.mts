import { defineConfig } from 'vitepress'

const enGuide = [
  { text: 'Overview', link: '/guide/' },
  { text: 'Architecture & context', link: '/guide/architecture' },
  { text: 'Configuration', link: '/guide/configuration' },
  { text: 'Prism, OIDC & OAuth', link: '/guide/authentication' },
  { text: 'Permissions', link: '/guide/permissions' },
  { text: 'Deployment & networking', link: '/guide/deployment' },
  { text: 'Operations', link: '/guide/operations' },
  { text: 'Development', link: '/guide/development' },
]

const zhGuide = [
  { text: '概览', link: '/zh/guide/' },
  { text: '架构与上下文', link: '/zh/guide/architecture' },
  { text: '配置', link: '/zh/guide/configuration' },
  { text: 'Prism、OIDC 与 OAuth', link: '/zh/guide/authentication' },
  { text: '权限', link: '/zh/guide/permissions' },
  { text: '部署与网络', link: '/zh/guide/deployment' },
  { text: '运维', link: '/zh/guide/operations' },
  { text: '开发', link: '/zh/guide/development' },
]

export default defineConfig({
  title: 'Lag Fork',
  description: 'Operator and developer documentation for the independent Lag fork',
  cleanUrls: true,
  lastUpdated: true,
  head: [['meta', { name: 'theme-color', content: '#0c756f' }]],
  locales: {
    root: { label: 'English', lang: 'en-US' },
    zh: { label: '简体中文', lang: 'zh-CN', link: '/zh/' },
  },
  themeConfig: {
    logo: '/mark.svg',
    siteTitle: 'Lag Fork Docs',
    search: { provider: 'local' },
    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'Operations', link: '/guide/operations' },
      { text: '中文', link: '/zh/' },
    ],
    sidebar: {
      '/guide/': [{ text: 'Independent fork', items: enGuide }],
      '/zh/guide/': [{ text: '独立分支', items: zhGuide }],
    },
    footer: {
      message: 'Independent fork documentation. Not an upstream Lag service.',
      copyright: 'Released under the repository license.',
    },
  },
})
