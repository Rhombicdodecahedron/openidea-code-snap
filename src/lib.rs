//! Code Snap: turn the selected code into an image.
//!
//! The code side is small. `snap` reads the selection (or the whole file),
//! keeps it in storage and reveals the panel. The panel (`web/`) draws and
//! exports the image. Messages between them are JSON objects with a `type`:
//!
//! - page → plugin: `ready` (send me what you have), `prefs` (remember my style)
//! - plugin → page: `init` (last snippet and prefs), `snippet` (a new snippet)

use openidea_plugin::views::{View, ViewEvent, Viewport, Views};
use openidea_plugin::{Error, Invocation, Plugin, host, register_plugin};
use serde_json::{Value, json};

const VIEW: &str = "snap";
const MAX_BYTES: usize = 64 * 1024;
const MAX_PREFS_BYTES: usize = 4 * 1024;

#[derive(Default)]
pub struct CodeSnap;

fn file_name(path: &str) -> &str {
    path.rsplit(['/', '\\']).next().unwrap_or(path)
}

/// The snippet for `snap`: the first selection that isn't blank, else the whole file.
fn snippet(ctx: &Invocation) -> Result<Value, Error> {
    let editor = ctx.editor().ok_or("Open a file and select some code first")?;
    let doc = editor.document()?;
    let selected = editor.selections()?.into_iter().filter_map(|r| doc.text_in(r)).find(|t| !t.trim().is_empty());
    let code = selected.unwrap_or(&doc.text);
    if code.trim().is_empty() {
        return Err("There is no code to snap".into());
    }
    if code.len() > MAX_BYTES {
        return Err(format!("The selection is too large to snap ({} KiB, at most 64 KiB)", code.len() / 1024).into());
    }
    Ok(json!({ "code": code, "language": editor.language(), "fileName": file_name(&editor.path()) }))
}

fn stored(key: &str) -> Value {
    host::storage::get(key).ok().flatten().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(Value::Null)
}

impl Plugin for CodeSnap {
    fn run_command(&mut self, id: &str, ctx: &Invocation, _arg: Option<&str>) -> Result<Option<String>, Error> {
        match id {
            "snap" => {
                let snippet = snippet(ctx)?;
                host::storage::set("snippet", &snippet.to_string())?;
                host::reveal_view(VIEW)?;
                // The page may not be loaded yet; it asks with `ready` once it is.
                let _ = host::post_view_message(VIEW, &json!({ "type": "snippet", "snippet": snippet }).to_string());
                Ok(None)
            }
            _ => Err(format!("unknown command {id}").into()),
        }
    }
}

impl Views for CodeSnap {
    fn render(&mut self, _view: &str, _viewport: Option<Viewport>, _ctx: &Invocation) -> Result<View, Error> {
        // The panel is a web page (`web = …` in plugin.toml); nothing to render here.
        Ok(View::message("Code Snap"))
    }

    fn handle(&mut self, view: &str, event: ViewEvent, _ctx: &Invocation) -> Result<(), Error> {
        let ViewEvent::Message(text) = event else { return Ok(()) };
        let msg: Value = serde_json::from_str(&text).map_err(|e| Error::Invalid(e.to_string()))?;
        match msg["type"].as_str() {
            Some("ready") => {
                let init = json!({ "type": "init", "snippet": stored("snippet"), "prefs": stored("prefs") });
                host::post_view_message(view, &init.to_string())
            }
            Some("prefs") => {
                let prefs = msg["prefs"].to_string();
                if prefs.len() > MAX_PREFS_BYTES || !msg["prefs"].is_object() {
                    return Err(Error::Invalid("prefs must be a small object".into()));
                }
                host::storage::set("prefs", &prefs)
            }
            _ => Ok(()),
        }
    }
}

register_plugin!(CodeSnap, views);

#[cfg(test)]
mod tests {
    use super::*;
    use openidea_plugin::mock::MockHost;

    fn last_message(host: &MockHost) -> Value {
        let (view, text) = host.view_messages().pop().expect("a message to the panel");
        assert_eq!(view, VIEW);
        serde_json::from_str(&text).unwrap()
    }

    #[test]
    fn snaps_the_selection_and_opens_the_panel() {
        let host = MockHost::install();
        host.open_editor("/project/src/main.rs", "rust", "fn main() {\n    run();\n}\n", &[(1, 4, 1, 10)]);
        CodeSnap.run_command("snap", &host.invocation(), None).unwrap();

        let msg = last_message(&host);
        assert_eq!(msg["type"], "snippet");
        assert_eq!(msg["snippet"]["code"], "run();");
        assert_eq!(msg["snippet"]["language"], "rust");
        assert_eq!(msg["snippet"]["fileName"], "main.rs");
        assert_eq!(host.revealed_views(), [VIEW]);
        assert!(host.storage()["snippet"].contains("run();"));
    }

    #[test]
    fn snaps_the_whole_file_without_a_selection() {
        let host = MockHost::install();
        host.open_editor("/project/app.ts", "typescript", "export const a = 1;\n", &[(0, 0, 0, 0)]);
        CodeSnap.run_command("snap", &host.invocation(), None).unwrap();
        assert_eq!(last_message(&host)["snippet"]["code"], "export const a = 1;\n");
    }

    #[test]
    fn refuses_a_blank_file() {
        let host = MockHost::install();
        host.open_editor("/project/empty.rs", "rust", "\n\n", &[]);
        let err = CodeSnap.run_command("snap", &host.invocation(), None).unwrap_err();
        assert!(err.to_string().contains("no code"), "{err}");
    }

    #[test]
    fn answers_ready_with_the_last_snippet_and_prefs() {
        let host = MockHost::install();
        host.open_editor("/project/a.py", "python", "print('hi')\n", &[(0, 0, 0, 11)]);
        let mut plugin = CodeSnap;
        plugin.run_command("snap", &host.invocation(), None).unwrap();
        let prefs = r#"{"type":"prefs","prefs":{"theme":"neon-siren","pad":64}}"#;
        plugin.handle(VIEW, ViewEvent::Message(prefs.into()), &host.invocation()).unwrap();
        plugin.handle(VIEW, ViewEvent::Message(r#"{"type":"ready"}"#.into()), &host.invocation()).unwrap();

        let init = last_message(&host);
        assert_eq!(init["type"], "init");
        assert_eq!(init["snippet"]["code"], "print('hi')");
        assert_eq!(init["prefs"]["theme"], "neon-siren");
    }

    #[test]
    fn ready_before_any_snap_sends_nulls() {
        let host = MockHost::install();
        CodeSnap.handle(VIEW, ViewEvent::Message(r#"{"type":"ready"}"#.into()), &host.invocation()).unwrap();
        let init = last_message(&host);
        assert!(init["snippet"].is_null() && init["prefs"].is_null());
    }
}
