# Photo Validation Prompt

Analyze this image for character sticker creation.

## Questions

1. **Primary Subject**: Is there a clear primary subject (one person) who is obviously the focus of the photo? Consider:
   - Takes up a significant portion of the frame
   - Is in focus (not blurred background people)
   - Is positioned as the main subject (centered, foreground, etc.)

2. **Face Clarity**: Can you clearly see the primary subject's face? (Well-lit, not obscured, facing camera enough to capture features)

Ignore incidental people in the background who are clearly not the subject (distant crowds, passersby, etc.)

## Response Format

```json
{
  "hasPrimarySubject": <boolean - is there one clear main subject>,
  "faceVisible": <boolean - can we see their face clearly>,
  "issue": "<description if there's a problem, otherwise null>"
}
```

### Issue Examples
- "No clear subject - photo appears to be a landscape/object"
- "Multiple people appear to be equal subjects (group photo)"
- "Face is obscured by sunglasses and hat"
- "Subject is too far away to see facial features"
