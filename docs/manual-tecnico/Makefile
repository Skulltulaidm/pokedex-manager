# PokeDex Manager — technical manual.
#
#   make            build the diagrams, then the PDF
#   make diagramas  regenerate only the figures
#   make limpiar    drop every generated artefact
#
# Requires: pdflatex + latexmk (TeX Live), plantuml (and a JRE), graphviz,
# and rsvg-convert (librsvg) to turn PlantUML's SVG into vector PDF.

SRC  := diagramas/src
OUT  := diagramas/out

PUML := $(wildcard $(SRC)/seq-*.puml)
DOT  := $(wildcard $(SRC)/*.dot)

FIGS := $(patsubst $(SRC)/%.puml,$(OUT)/%.pdf,$(PUML)) \
        $(patsubst $(SRC)/%.dot,$(OUT)/%.pdf,$(DOT))

.PHONY: all diagramas limpiar ver
.DELETE_ON_ERROR:

all: manual-tecnico.pdf

diagramas: $(FIGS)

# PlantUML: SVG first, then librsvg to PDF. `-tpdf` also works but substitutes a
# serif face for the diagram labels.
$(OUT)/%.pdf: $(SRC)/%.puml $(SRC)/estilo.puml | $(OUT)
	plantuml -charset UTF-8 -tsvg -o "$(CURDIR)/$(OUT)" "$<"
	rsvg-convert -f pdf -o "$@" "$(OUT)/$*.svg"
	rm -f "$(OUT)/$*.svg"

$(OUT)/%.pdf: $(SRC)/%.dot | $(OUT)
	dot -Tpdf "$<" -o "$@"

$(OUT):
	mkdir -p $(OUT)

manual-tecnico.pdf: manual-tecnico.tex estilo/pokedex.sty $(wildcard secciones/*.tex) $(FIGS)
	latexmk -pdf -interaction=nonstopmode -halt-on-error -file-line-error manual-tecnico.tex

limpiar:
	latexmk -C manual-tecnico.tex
	rm -rf $(OUT)
