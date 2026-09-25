# Special Cases Fixture

This fixture tests edge cases in markdown parsing and heading hierarchy.

## Code Blocks With Headings

```markdown
# This is not a heading
## Neither is this
```

## Duplicate Heading Name

Some text here.

## Duplicate Heading Name

Some more text for the duplicate heading to verify unique identity assignment and disambiguation.

## Formula Delimiters

Here is an unclosed formula line followed by valid formulas:
$a + b = c$
and a display block:
$$f(x) = \int_0^x t^2 \, dt$$
