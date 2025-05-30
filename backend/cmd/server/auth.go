package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"

	"google.golang.org/api/idtoken"
)

type User string
type AuthHandlerFunc func(http.ResponseWriter, *http.Request, User)

func checkCookie(db Db, r *http.Request) (User, *httpError) {
	session, err := r.Cookie("session")
	if err != nil && err != http.ErrNoCookie {
		return "", &httpError{fmt.Sprintf("Unexpected error reading session cookie: %v", err), http.StatusInternalServerError}
	}

	if session == nil {
		return "", &httpError{"No session cookie", http.StatusUnauthorized}
	}

	fields := strings.Fields(session.Value)
	if len(fields) != 2 {
		return "", &httpError{"Malformed session cookie", http.StatusUnauthorized}
	}

	email := fields[0]
	cookieNonce := fields[1]
	userNonce := db.GetSession(r.Context(), email)
	if userNonce != cookieNonce {
		return "", &httpError{fmt.Sprintf("Invalid session cookie for email %s", email), http.StatusUnauthorized}
	}
	return User(email), nil
}

func checkToken(db Db, gClientId string, w http.ResponseWriter, r *http.Request) (User, *httpError) {
	authHeader := r.Header.Get("Authorization")
	if !strings.HasPrefix(authHeader, "Bearer ") {
		return "", &httpError{"Missing or invalid Authorization header", http.StatusUnauthorized}
	}

	token := strings.TrimPrefix(authHeader, "Bearer ")
	payload, err := idtoken.Validate(context.Background(), token, gClientId)
	if err != nil {
		return "", &httpError{"Invalid ID token: " + err.Error(), http.StatusUnauthorized}
	}

	email, ok := payload.Claims["email"].(string)
	if !ok {
		return "", &httpError{"No valid email claim", http.StatusUnauthorized}
	}

	nonce := db.GetSession(r.Context(), email)
	if nonce == "" {
		return "", &httpError{fmt.Sprintf("No registered user %s", email), http.StatusUnauthorized}
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    fmt.Sprintf("%s %s", email, nonce),
		MaxAge:   2592000, // 30 days
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})

	return User(email), nil
}

func requireAuth(db Db, gClientId string) func(AuthHandlerFunc) http.HandlerFunc {
	return func(next AuthHandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			var err *httpError
			var user User
			if user, err = checkCookie(db, r); err == nil {
				next(w, r, user)
				return
			}
			log.Printf("No session cookie, check for token: %v", err)
			if err.Code == http.StatusUnauthorized {
				if user, err = checkToken(db, gClientId, w, r); err == nil {
					log.Printf("token auth for %s succeeded", user)
					next(w, r, user)
					return
				}
			}
			logError(w, err.Message, err.Code)
		}
	}
}
