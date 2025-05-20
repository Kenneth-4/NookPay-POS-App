import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import { router } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleResetPassword = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    
    if (!email) {
      setErrorMessage('Please enter your email address');
      return;
    }

    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccessMessage('Password reset email sent! Check your inbox.');
      setEmail('');
    } catch (error: any) {
      let message = 'Failed to send reset email';
      
      if (error.code === 'auth/invalid-email') {
        message = 'Invalid email address';
      } else if (error.code === 'auth/user-not-found') {
        message = 'No account found with this email';
      } else if (error.code === 'auth/too-many-requests') {
        message = 'Too many attempts. Please try again later';
      } else if (error.code === 'auth/network-request-failed') {
        message = 'Network error. Please check your internet connection';
      }
      
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <FontAwesome name="lock" size={48} color="#F36514" />
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>Enter your email to receive a password reset link</Text>
        </View>

        <View style={styles.formContainer}>
          <View style={styles.form}>
            {errorMessage ? (
              <View style={styles.errorContainer}>
                <FontAwesome name="exclamation-circle" size={20} color="#DC2626" style={styles.alertIcon} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {successMessage ? (
              <View style={styles.successContainer}>
                <FontAwesome name="check-circle" size={20} color="#059669" style={styles.alertIcon} />
                <Text style={styles.successText}>{successMessage}</Text>
              </View>
            ) : null}
            
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email Address</Text>
              <View style={styles.inputWrapper}>
                <FontAwesome name="envelope" size={20} color="#6B7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleResetPassword}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <FontAwesome name="paper-plane" size={20} color="#FFFFFF" style={styles.buttonIcon} />
                  <Text style={styles.buttonText}>Send Reset Link</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backToLogin}
              onPress={() => router.back()}
            >
              <FontAwesome name="arrow-left" size={16} color="#F36514" style={styles.backIcon} />
              <Text style={styles.backToLoginText}>Back to Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    marginBottom: 32,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    maxWidth: 400,
  },
  formContainer: {
    backgroundColor: '#FFFFFF',
    padding: 32,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 4,
    width: '100%',
    maxWidth: 480,
  },
  form: {
    width: '100%',
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  successContainer: {
    backgroundColor: '#ECFDF5',
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  alertIcon: {
    marginRight: 12,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 15,
    flex: 1,
  },
  successText: {
    color: '#059669',
    fontSize: 15,
    flex: 1,
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  inputIcon: {
    marginLeft: 16,
    marginRight: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingRight: 16,
    fontSize: 16,
    color: '#1F2937',
  },
  button: {
    backgroundColor: '#F36514',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonIcon: {
    marginRight: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  backToLogin: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    padding: 8,
  },
  backIcon: {
    marginRight: 8,
  },
  backToLoginText: {
    color: '#F36514',
    fontSize: 15,
    fontWeight: '500',
  },
});
