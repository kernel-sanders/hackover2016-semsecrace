all: semsecrace static

semsecrace: semsecrace.go
	go build $<

static: static/semsecrace.min.js static/semsecrace.min.css

static/semsecrace.min.js: static/semsecrace.js
	yui-compressor $< > $@

static/semsecrace.min.css: static/semsecrace.css
	yui-compressor $< > $@

clean:
	rm -f semsecrace static/semsecrace.min.js static/semsecrace.min.css
