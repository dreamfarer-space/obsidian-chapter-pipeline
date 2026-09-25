# Welcome to Chapter Pipeline Smoke Test

Welcome to the automated smoke test vault for Chapter Pipeline. This note verifies basic outline parsing, excerpt generation, and KaTeX rendering.

## Getting Started

Chapter Pipeline provides a sleek, Linear-inspired horizontal stepper docked to your note margins.

### System Requirements

- Obsidian Desktop version 0.15.9 or later.
- Compatible with both Reading View and Live Preview.

### Installation

Install via Obsidian Community Plugins or copy the release files (`main.js`, `manifest.json`, `styles.css`) into your vault plugins folder.

## Mathematical Formulation

Here is a sample KaTeX formula to verify math excerpt rendering in the tooltip:

$$\int_{-\infty}^{\infty} e^{-x^2} \, dx = \sqrt{\pi}$$

The pipeline extracts section excerpts while cleanly balancing math delimiters such as `$E = mc^2$`.

## Navigation Features

1. Click any dash to jump smoothly to the corresponding section.
2. Use keyboard navigation through the command palette.
3. Open split panes to compare notes side by side.

### Reading View Tracking

In Reading View, the active chapter highlights as you scroll down the page.

### Live Preview Tracking

In Live Preview, CodeMirror document coordinates are mapped to active headings even when headings are virtualized off-screen.

## Summary

This note serves as the entry fixture for lifecycle and navigation smoke tests.
