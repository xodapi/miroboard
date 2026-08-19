# Help Panel Integration Guide

This guide explains how to integrate the HelpPanel component into your MiroBoard application.

## Files Created

1. **`src/HelpPanel.tsx`** - React component with help content and SVG diagrams
2. **`src/help-panel.css`** - Complete styling for the help system
3. **`HELP_INTEGRATION.md`** - This integration guide

## Quick Integration

### Step 1: Import HelpPanel in App.tsx

Add the import at the top of your `App.tsx` file:

```typescript
import { HelpPanel } from './HelpPanel';
```

### Step 2: Add HelpPanel to your component tree

Add the HelpPanel component anywhere in your App component's JSX. It's recommended to place it at the root level:

```typescript
function App() {
  return (
    <div className="App">
      {/* Your existing app content */}
      <YourExistingComponents />
      
      {/* Add HelpPanel at the end */}
      <HelpPanel />
    </div>
  );
}
```

### Complete Example

Here's a complete example of how your `App.tsx` might look:

```typescript
import React from 'react';
import { HelpPanel } from './HelpPanel';
import './App.css';

function App() {
  return (
    <div className="App">
      {/* Your main application content */}
      <header>
        <h1>MiroBoard</h1>
      </header>
      
      <main>
        {/* Your BPMN editor and other components */}
      </main>
      
      {/* Help Panel - always available via ? button */}
      <HelpPanel />
    </div>
  );
}

export default App;
```

## Features

### User Experience
- **Fixed Help Button**: A blue circular "?" button appears in the bottom-right corner
- **Slide-in Panel**: Clicking the button opens a 600px panel from the right side
- **Backdrop**: Semi-transparent overlay allows users to click outside to close
- **Smooth Animations**: Slide and fade animations for professional feel
- **Scrollable Content**: Full help documentation with embedded SVG diagrams

### Responsive Design
- **Desktop**: 600px wide panel on the right
- **Tablet**: 500px wide panel
- **Mobile**: Full-width panel (100vw)
- **Print-friendly**: Optimized for printing documentation

### Accessibility
- **Keyboard Navigation**: Focus indicators on interactive elements
- **ARIA Labels**: Proper labels for screen readers
- **High Contrast**: Support for high contrast mode
- **Reduced Motion**: Respects prefers-reduced-motion setting

## Customization

### Changing Button Position

Edit `.help-button` in `help-panel.css`:

```css
.help-button {
  bottom: 30px;  /* Change vertical position */
  right: 30px;   /* Change horizontal position */
}
```

### Changing Panel Width

Edit `.help-panel` in `help-panel.css`:

```css
.help-panel {
  width: 600px;  /* Change to desired width */
}
```

### Changing Colors

Main colors used:
- Primary blue: `#0066cc` (buttons, headings)
- Success green: `#28a745` (diagrams, examples)
- Warning orange: `#ff9500` (highlights, priorities)

Search and replace these colors in `help-panel.css` to match your brand.

### Changing Button Icon

Edit the button text in `HelpPanel.tsx`:

```typescript
<button className="help-button" onClick={() => setIsOpen(true)}>
  ?  {/* Change to any icon or text */}
</button>
```

You can also use an icon library like FontAwesome or Material Icons:

```typescript
import { HelpOutline } from '@material-ui/icons';

<button className="help-button" onClick={() => setIsOpen(true)}>
  <HelpOutline />
</button>
```

## Advanced Usage

### Programmatic Control

If you need to control the panel from other components, lift the state up:

```typescript
// In App.tsx
import { useState } from 'react';
import { HelpPanel } from './HelpPanel';

function App() {
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  return (
    <div className="App">
      <header>
        <button onClick={() => setIsHelpOpen(true)}>
          Open Help
        </button>
      </header>
      
      {/* Pass state as props (you'll need to modify HelpPanel.tsx) */}
      <HelpPanel isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
}
```

Then modify `HelpPanel.tsx` to accept props:

```typescript
interface HelpPanelProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function HelpPanel({ isOpen: externalIsOpen, onClose: externalOnClose }: HelpPanelProps = {}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const setIsOpen = externalOnClose ? () => externalOnClose() : setInternalIsOpen;
  
  // Rest of the component...
}
```

### Adding Custom Sections

To add new help sections, edit `HelpPanel.tsx` and add a new `<section>` inside `.help-content`:

```typescript
<section>
  <h2>Your New Section</h2>
  <h3>Subsection</h3>
  <p>Your content here...</p>
</section>
```

### Adding More Diagrams

To add custom SVG diagrams:

1. Create your SVG
2. Wrap it in a `<div className="diagram">` element
3. Add a descriptive caption in `<p><em>...</em></p>`

Example:

```typescript
<div className="diagram">
  <svg viewBox="0 0 600 300" xmlns="http://www.w3.org/2000/svg">
    {/* Your SVG content */}
  </svg>
  <p><em>Your diagram description</em></p>
</div>
```

## Troubleshooting

### Panel doesn't appear
- Check that `HelpPanel` is imported correctly
- Verify that `help-panel.css` is imported in `HelpPanel.tsx`
- Check browser console for errors

### Styling issues
- Ensure `help-panel.css` is in the same directory as `HelpPanel.tsx`
- Check for CSS conflicts with existing styles
- Verify z-index values don't conflict with other fixed/absolute elements

### Button not visible
- Check if other elements have higher z-index than 999
- Verify the button isn't covered by other fixed elements
- Check responsive breakpoints match your layout

### Animation issues
- Check browser support for CSS animations
- Verify `prefers-reduced-motion` setting if animations are disabled
- Check for conflicting CSS transitions

## Browser Support

- **Chrome/Edge**: Full support
- **Firefox**: Full support
- **Safari**: Full support (iOS 12+)
- **IE11**: Not supported (uses modern CSS features)

## Dependencies

**Zero external dependencies** - The component uses only:
- React hooks (useState)
- Standard HTML/CSS
- Inline SVG

No additional packages need to be installed.

## File Sizes

- `HelpPanel.tsx`: ~35 KB
- `help-panel.css`: ~6 KB
- Total bundle impact: ~41 KB (before gzip)

## Testing

### Manual Testing Checklist

- [ ] Help button appears in bottom-right corner
- [ ] Clicking button opens panel from right side
- [ ] Clicking backdrop closes panel
- [ ] Clicking × button closes panel
- [ ] Panel content is scrollable
- [ ] All 6 SVG diagrams render correctly
- [ ] Responsive on mobile (test at 375px width)
- [ ] Responsive on tablet (test at 768px width)
- [ ] Keyboard navigation works (Tab, Enter, Escape)
- [ ] Print layout is clean (Ctrl+P to preview)

### Automated Testing

Example test with React Testing Library:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { HelpPanel } from './HelpPanel';

test('opens help panel when button is clicked', () => {
  render(<HelpPanel />);
  
  const button = screen.getByLabelText('Открыть справку');
  fireEvent.click(button);
  
  expect(screen.getByText(/Руководство по симуляции BPMN/i)).toBeInTheDocument();
});

test('closes help panel when close button is clicked', () => {
  render(<HelpPanel />);
  
  // Open panel
  fireEvent.click(screen.getByLabelText('Открыть справку'));
  
  // Close panel
  fireEvent.click(screen.getByLabelText('Закрыть справку'));
  
  expect(screen.queryByText(/Руководство по симуляции BPMN/i)).not.toBeInTheDocument();
});
```

## Support

For issues or questions:
1. Check this integration guide
2. Review the component code in `HelpPanel.tsx`
3. Check browser console for errors
4. Verify CSS is loading correctly

## License

This component is part of the MiroBoard project and follows the same license.
