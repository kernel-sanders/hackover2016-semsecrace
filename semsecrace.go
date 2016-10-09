package main

import (
	"crypto/rand"
	"crypto/aes"
	"encoding/base32"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"sync"
	"time"
)

const NUM_STAGES = 40
const FLAG = "hackover16{REMOVED}"

var validStates = make(map[string]*State)
var validStateMutex = new(sync.Mutex)
var tmpl *template.Template

type JsonResponse struct {
	Action string `json:"action"`
	Text   string `json:"text"`
}

type State struct {
	Code       string
	Stage      uint8
	Colors      []byte
	ValidUntil time.Time
}

func (s *State) GetColor() string {
	numBit := s.Stage % 8
	colorPos := s.Stage / 8
	if (s.Colors[colorPos]>>numBit)&0x1 == 0 {
		return "red"
	} else {
		return "blue"
	}
}

func (s *State) Activity() {
	s.ValidUntil = time.Now().Add(15 * time.Minute)
}

func (s *State) Burn() {
	validStateMutex.Lock()
	defer validStateMutex.Unlock()
	delete(validStates, s.Code)
}

func (s *State) EncodeCode() string {
	return base32.StdEncoding.EncodeToString([]byte(s.Code))
}

func (s *State) IsExpired() bool {
	return s.ValidUntil.Before(time.Now())
}

func NewState() *State {
	code := make([]byte, 20)
	if _, err := io.ReadFull(rand.Reader, code); err != nil {
		log.Fatal("Oh no! Out of randomness for state code")
	}
	colors := make([]byte, NUM_STAGES/8+1)
	if _, err := io.ReadFull(rand.Reader, colors); err != nil {
		log.Fatal("Oh no! Out of randomness for colors")
	}
	s := &State{Code: string(code), Stage: 0, Colors: colors}
	s.Activity()
	validStateMutex.Lock()
	defer validStateMutex.Unlock()
	validStates[s.Code] = s
	return s
}

func getState(codeBase32 string) *State {
	code, err := base32.StdEncoding.DecodeString(codeBase32)
	if err != nil {
		return nil
	}
	s := validStates[string(code)]
	if s == nil {
		return nil
	}
	if s.IsExpired() {
		return nil
	}
	s.Activity()
	return s
}

func main() {
	var err error
	tmpl, err = template.ParseFiles("semsecrace.html")
	if err != nil {
		log.Fatal("Could not load template", err)
	}

	go cleaner()
	http.HandleFunc("/", handleIndex)
	http.HandleFunc("/race", handleRace)
	http.HandleFunc("/choose", handleChooseColor)
	http.HandleFunc("/ciphertext", handleGetCiphertext)
	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("./static"))))

	log.Fatal(http.ListenAndServe(":8202", nil))
}

func handleIndex(w http.ResponseWriter, r *http.Request) {
	s := NewState()
	http.Redirect(w, r, "/race?driver_license="+s.EncodeCode(), http.StatusFound)
}

func handleRace(w http.ResponseWriter, r *http.Request) {
	s := getState(r.FormValue("driver_license"))
	if s == nil {
		http.Redirect(w, r, "/", http.StatusFound)
		return
	}
	err := tmpl.ExecuteTemplate(w, "semsecrace.html", struct {
		DriverLicense string
		NumStages     int
	}{s.EncodeCode(), NUM_STAGES})
	if err != nil {
		log.Fatal("Could not execute template", err)
	}
}

func handleChooseColor(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	s := getState(r.FormValue("driver_license"))
	if s == nil {
		json.NewEncoder(w).Encode(JsonResponse{Action: "expired"})
		return
	}

	var resp JsonResponse
	color := r.FormValue("color")
	if s.GetColor() == color {
		s.Stage++
		if s.Stage >= NUM_STAGES {
			resp = JsonResponse{Action: "flag", Text: fmt.Sprintf("Winner!<br>%s", FLAG)}
			s.Burn()
		} else {
			resp = JsonResponse{Action: color}
		}
	} else {
		s.Burn()
		resp = JsonResponse{Action: "burn", Text: "You took the wrong color."}
	}
	json.NewEncoder(w).Encode(resp)
}

func handleGetCiphertext(w http.ResponseWriter, r *http.Request) {
	s := getState(r.FormValue("driver_license"))
	if s == nil {
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusForbidden)
		fmt.Fprintln(w, "Your driver license expired. Try again.")
		return
	}
	
	m0 := []byte(r.FormValue("m0"))
	m1 := []byte(r.FormValue("m1"))
	
	if len(m0) != len(m1) {
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusForbidden)
		fmt.Fprintln(w, "We are in the semantic security race. Follow the rules!")
		return
	}

	var msg []byte
	if s.GetColor() == "red" {
		msg = m0
	} else {
		msg = m1
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Write(encrypt(msg))
}

func encrypt(message []byte) []byte {
	key := make([]byte, aes.BlockSize)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		log.Fatal("Oh no! Out of randomness for key")
	}
	block, _ := aes.NewCipher(key)
	someByte := byte(aes.BlockSize - (len(message) % aes.BlockSize))
	for i := byte(0); i < someByte; i++ {
		message = append(message, someByte)
	}
	ciphertext := make([]byte, len(message))
	for i := 0; i < len(message) / aes.BlockSize; i++ {
		src := message[i*aes.BlockSize:(i+1)*aes.BlockSize]
		dst := ciphertext[i*aes.BlockSize:(i+1)*aes.BlockSize]
		block.Encrypt(dst, src)
	}
	return ciphertext
}


func cleaner() {
	t := time.NewTicker(1 * time.Minute)
	for {
		<-t.C
		cleanup()
	}
}

func cleanup() {
	oldCodes := make([]string, 0)

	validStateMutex.Lock()
	for code, s := range validStates {
		if s.IsExpired() {
			oldCodes = append(oldCodes, code)
		}
	}
	for _, code := range oldCodes {
		delete(validStates, code)
	}
	validStateMutex.Unlock()
}
