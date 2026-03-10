import zipfile
import xml.etree.ElementTree as ET
import sys

def read_docx(path):
    try:
        with zipfile.ZipFile(path) as d:
            xml_content = d.read('word/document.xml')
        tree = ET.XML(xml_content)
        NS = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
        paragraphs = []
        for p in tree.iter(NS + 'p'):
            texts = [t.text for t in p.iter(NS + 't') if t.text]
            if texts:
                paragraphs.append(''.join(texts))
        return '\n'.join(paragraphs)
    except Exception as e:
        return f"Error: {e}"

if __name__ == "__main__":
    if len(sys.argv) > 2:
        output_txt = sys.argv[2]
        with open(output_txt, 'w', encoding='utf-8') as f:
            f.write(read_docx(sys.argv[1]))
        print(f"Saved to {output_txt}")
    else:
        print("Usage: python read_docx.py <path_to_docx> <output_txt>")
