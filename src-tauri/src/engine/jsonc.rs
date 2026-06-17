/// Strip JSONC to valid JSON: removes `//` and `/* */` comments plus trailing commas.
pub fn strip_comments(input: &str) -> String {
    let stripped = strip_comments_raw(input);
    strip_trailing_commas(&stripped)
}

/// Remove trailing commas before `}` or `]` (common in JSONC).
fn strip_trailing_commas(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b',' {
            // Look ahead: skip whitespace, check for } or ]
            let mut j = i + 1;
            while j < bytes.len()
                && (bytes[j] == b' ' || bytes[j] == b'\t' || bytes[j] == b'\n' || bytes[j] == b'\r')
            {
                j += 1;
            }
            if j < bytes.len() && (bytes[j] == b'}' || bytes[j] == b']') {
                // Trailing comma — skip it
                i += 1;
                continue;
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

fn strip_comments_raw(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    let mut in_string = false;
    let mut escape_next = false;

    while let Some(c) = chars.next() {
        if escape_next {
            out.push(c);
            escape_next = false;
            continue;
        }

        if in_string {
            match c {
                '\\' => {
                    escape_next = true;
                    out.push(c);
                }
                '"' => {
                    in_string = false;
                    out.push(c);
                }
                _ => {
                    out.push(c);
                }
            }
            continue;
        }

        // Not in string
        match c {
            '"' => {
                in_string = true;
                out.push(c);
            }
            '/' => match chars.peek() {
                Some('/') => {
                    // Line comment — consume until newline
                    chars.next();
                    for ch in chars.by_ref() {
                        if ch == '\n' {
                            out.push('\n');
                            break;
                        }
                    }
                }
                Some('*') => {
                    // Block comment — consume until */
                    chars.next();
                    loop {
                        match chars.next() {
                            Some('*') if chars.peek() == Some(&'/') => {
                                chars.next();
                                break;
                            }
                            Some('\n') => out.push('\n'), // preserve line count
                            None => break,
                            _ => {}
                        }
                    }
                }
                _ => {
                    out.push(c);
                }
            },
            _ => {
                out.push(c);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_line_comments() {
        let input = r#"{"a": 1, // comment
"b": 2}"#;
        let result = strip_comments(input);
        let v: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(v["a"], 1);
        assert_eq!(v["b"], 2);
    }

    #[test]
    fn strips_block_comments() {
        let input = r#"{"a": /* remove this */ 1}"#;
        let result = strip_comments(input);
        let v: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(v["a"], 1);
    }

    #[test]
    fn preserves_url_in_string() {
        let input = r#"{"url": "https://example.com/foo"}"#;
        let result = strip_comments(input);
        assert_eq!(result, input);
    }

    #[test]
    fn handles_commented_out_block() {
        let input = r#"{
  "active": 1,
  // "disabled": 2
}"#;
        let result = strip_comments(input);
        let v: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(v["active"], 1);
        assert!(v.get("disabled").is_none());
    }
}
