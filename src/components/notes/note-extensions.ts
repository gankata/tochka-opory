import { mergeAttributes, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";

export const NoteLink = Node.create({
  name: "noteLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      noteId: {
        default: null,
        parseHTML: (element) => Number(element.getAttribute("data-note-id")),
        renderHTML: (attributes) => ({ "data-note-id": attributes.noteId }),
      },
      title: {
        default: "Заметка",
        parseHTML: (element) => element.getAttribute("data-title") ?? element.textContent,
        renderHTML: (attributes) => ({ "data-title": attributes.title }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "a[data-note-id]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["a", mergeAttributes(HTMLAttributes, {
      href: `/notes?note=${node.attrs.noteId}`,
      class: "note-link",
    }), node.attrs.title];
  },
});

export function createNoteExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        markdownLinks: true,
        defaultProtocol: "https",
        protocols: ["http", "https", "mailto"],
      },
    }),
    Image.configure({ allowBase64: false, HTMLAttributes: { loading: "lazy" } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    NoteLink,
  ];
}
