package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"

	"google.golang.org/api/idtoken"
)

func checkCookie(db Db, r *http.Request) *httpError {
	session, err := r.Cookie("session")
	if err != nil && err != http.ErrNoCookie {
		return &httpError{fmt.Sprintf("Unexpected error reading session cookie: %w", err), http.StatusInternalServerError}
	}

	if session == nil {
		return &httpError{"No session cookie", http.StatusUnauthorized}
	}

	fields := strings.Fields(session.Value)
	if len(fields) != 2 {
		return &httpError{"Malformed session cookie", http.StatusUnauthorized}
	}

	email := fields[0]
	cookieNonce := fields[1]
	userNonce := db.GetSession(r.Context(), email)
	if userNonce != cookieNonce {
		return &httpError{fmt.Sprintf("Invalid session cookie for email %s", email), http.StatusUnauthorized}
	}
	return nil
}

func checkToken(db Db, gClientId string, w http.ResponseWriter, r *http.Request) *httpError {
	authHeader := r.Header.Get("Authorization")
	if !strings.HasPrefix(authHeader, "Bearer ") {
		return &httpError{"Missing or invalid Authorization header", http.StatusUnauthorized}
	}

	token := strings.TrimPrefix(authHeader, "Bearer ")
	payload, err := idtoken.Validate(context.Background(), token, gClientId)
	if err != nil {
		return &httpError{"Invalid ID token: " + err.Error(), http.StatusUnauthorized}
	}

	email, ok := payload.Claims["email"].(string)
	if !ok {
		return &httpError{"No valid email claim", http.StatusUnauthorized}
	}

	nonce := db.GetSession(r.Context(), email)
	if nonce == "" {
		return &httpError{fmt.Sprintf("No registered user %s", email), http.StatusUnauthorized}
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    fmt.Sprintf("%s %s", email, nonce),
		MaxAge:   2592000, // 30 days
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})

	log.Printf("token auth for %s succeeded", email)
	return nil
}

func requireAuth(db Db, gClientId string) func(http.HandlerFunc) http.HandlerFunc {
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			var err *httpError
			if err = checkCookie(db, r); err == nil {
				next(w, r)
				return
			}
			log.Printf("No session cookie, check for token: %v", err)
			if err.Code == http.StatusUnauthorized {
				if err = checkToken(db, gClientId, w, r); err == nil {
					next(w, r)
					return
				}
			}
			logError(w, err.Message, err.Code)
		}
	}
}
